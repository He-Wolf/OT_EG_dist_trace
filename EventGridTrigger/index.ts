import { AzureFunction, Context, TraceContext } from "@azure/functions"
import * as opentelemetry from "@opentelemetry/api";
import { NodeTracerProvider, BatchSpanProcessor } from "@opentelemetry/sdk-trace-node";
import { AzureMonitorTraceExporter } from "@azure/monitor-opentelemetry-exporter";
import { W3CTraceContextPropagator } from "@opentelemetry/core";
import { EventGridEvent } from "@azure/eventgrid";
import { Resource } from "@opentelemetry/resources";
import { SemanticResourceAttributes } from "@opentelemetry/semantic-conventions";

interface EventGridData {
  message: string;
  traceparent: string;
  tracestate: string;
}

const eventGridTrigger: AzureFunction = async function (context: Context, eventGridEvent: EventGridEvent<EventGridData>): Promise<void> {
  context.log(`typeof eventGridEvent: ${JSON.stringify(typeof eventGridEvent)}`);
  context.log(`eventGridEvent: ${JSON.stringify(eventGridEvent)}`);

  const resource =
    Resource.default().merge(
      new Resource({
        [SemanticResourceAttributes.FAAS_NAME]: "EventGrid Function",
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

  const tracer = opentelemetry.trace.getTracer("EventGridConsumer");

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

  const propagator = new W3CTraceContextPropagator();
  const ctxProd = propagator.extract(
    opentelemetry.ROOT_CONTEXT,
    {
      traceparent: eventGridEvent.data.traceparent,
      tracestate: eventGridEvent.data.tracestate,
      attributes: undefined
    },
    eventgridGetter
  );

  const ctxProdSpan = opentelemetry.trace.getSpan(ctxProd);

  const options: opentelemetry.SpanOptions = {
    links: [
      {
        context: ctxProdSpan.spanContext()
      }
    ]
  };

  tracer.startActiveSpan('Process EventGrid event', options, async (span) => {
    span.addEvent("EventGrid function executed");
    span.addEvent(`span.spanContext() in span: ${JSON.stringify(span.spanContext())}`);
    span.end();
  });
};

export default eventGridTrigger;

