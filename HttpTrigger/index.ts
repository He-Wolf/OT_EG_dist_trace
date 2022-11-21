import { EventGridPublisherClient, AzureKeyCredential } from "@azure/eventgrid";
import { AzureFunction, Context, HttpRequest, TraceContext } from "@azure/functions"
import * as opentelemetry from "@opentelemetry/api";
import { NodeTracerProvider, BatchSpanProcessor } from "@opentelemetry/sdk-trace-node";
import { AzureMonitorTraceExporter } from "@azure/monitor-opentelemetry-exporter";
import { W3CTraceContextPropagator } from "@opentelemetry/core";
import { Resource } from "@opentelemetry/resources";
import { SemanticResourceAttributes } from "@opentelemetry/semantic-conventions";


const httpTrigger: AzureFunction = async function (context: Context, req: HttpRequest): Promise<void> {
  context.log('HTTP trigger function processed a request.');
  const name = (req.query.name || (req.body && req.body.name));
  const responseMessage = name
    ? "Hello, " + name + ". This HTTP triggered function executed successfully."
    : "This HTTP triggered function executed successfully. Pass a name in the query string or in the request body for a personalized response.";
  context.log(`function context.traceContext: ${JSON.stringify(context.traceContext)}`);
  // context.log(`appInsights.getCorrelationContext(): ${JSON.stringify(appInsights.getCorrelationContext())}`);

  const resource =
    Resource.default().merge(
      new Resource({
        [SemanticResourceAttributes.FAAS_NAME]: "Http Function",
        [SemanticResourceAttributes.FAAS_VERSION]: "0.1.0",
      })
    );
  const provider = new NodeTracerProvider({
    resource: resource,
  });
  const exporter = new AzureMonitorTraceExporter({
    connectionString:
      process.env["APPLICATIONINSIGHTS_CONNECTION_STRING"],
  });
  const processor = new BatchSpanProcessor(exporter);
  provider.addSpanProcessor(processor);
  provider.register();

  const tracer = opentelemetry.trace.getTracer("EventGridProducer");

  const eventgridGetter: opentelemetry.TextMapGetter<TraceContext> = {
    get(carrier: TraceContext, key: string) {
      if (key === "traceparent") {
        return carrier.traceparent;
      } else if (key === "tracestate") {
        return carrier.tracestate;
      }
    },
    keys(carrier: TraceContext) {
      return ["traceparent", "tracestate"];
    },
  };

  const eventgridSetter: opentelemetry.TextMapSetter<TraceContext> = {
    set(carrier: TraceContext, key: string, value: string) {
      if (key === "traceparent") {
        carrier.traceparent = value;
      } else if (key === "tracestate") {
        carrier.tracestate = value;
      }
    },
  };

  const propagator = new W3CTraceContextPropagator();
  const ctx = propagator.extract(
    opentelemetry.ROOT_CONTEXT,
    context.traceContext,
    eventgridGetter
  );

  const traceContext: TraceContext = {
    traceparent: undefined,
    tracestate: undefined,
    attributes: undefined
  };

  tracer.startActiveSpan('Send EventGrid event', {}, ctx, async (span) => {
    const client = new EventGridPublisherClient(
      process.env["EVENTGRID_ENDPOINT"],
      "EventGrid",
      new AzureKeyCredential(process.env["EVENTGRID_ACCESS_KEY"])
    );

    propagator.inject(opentelemetry.context.active(), traceContext, eventgridSetter);

    await client.send([
      {
        eventType: "Azure.Sdk.SampleEvent",
        subject: "Event Subject",
        dataVersion: "1.0",
        data: {
          message: responseMessage,
          traceparent: traceContext.traceparent,
          tracestate: traceContext.tracestate
        }
      }
    ]);
    span.end();
  });

  context.res = {
    // status: 200, /* Defaults to 200 */
    body: { responseMessage, traceContext }
  };

};

export default httpTrigger;