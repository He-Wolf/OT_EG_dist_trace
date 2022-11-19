import { AzureFunction, Context } from "@azure/functions"
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
        [SemanticResourceAttributes.SERVICE_NAME]: "service-name-here",
        [SemanticResourceAttributes.SERVICE_VERSION]: "0.1.0",
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

  const eventgridGetter: opentelemetry.TextMapGetter<EventGridData> = {
    get(carrier: EventGridData, key: string) {
      if (key === "traceparent") {
        return carrier.traceparent;
      } else if (key === "tracestate") {
        return carrier.tracestate;
      }
    },
    keys(carrier: EventGridData) {
      return [carrier.traceparent, carrier.tracestate]
    },
  };

  const propagator = new W3CTraceContextPropagator();
  const ctx = propagator.extract(opentelemetry.context.active(), eventGridEvent.data, eventgridGetter);
  const ctxSpan = opentelemetry.trace.getSpan(ctx);

  const options = {
    links: [
      {
        context: ctxSpan.spanContext()
      }
    ]
  };

  tracer.startActiveSpan('Process EventGridEvents', options, async (span) => {
    context.log(`ctx: ${JSON.stringify(ctx)}`);
    span.end();
  });
};

export default eventGridTrigger;

