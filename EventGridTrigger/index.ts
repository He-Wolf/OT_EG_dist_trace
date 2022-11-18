import { AzureFunction, Context } from "@azure/functions"
import * as opentelemetry from "@opentelemetry/api";
import { AzureMonitorTraceExporter } from "@azure/monitor-opentelemetry-exporter";
import { BasicTracerProvider, SimpleSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { W3CTraceContextPropagator } from "@opentelemetry/core";
import { EventGridEvent } from "@azure/eventgrid";

interface EventGridData {
  message: string;
  traceparent: string;
  tracestate: string;
}

const eventGridTrigger: AzureFunction = async function (context: Context, eventGridEvent: EventGridEvent<EventGridData>): Promise<void> {
  context.log(`typeof eventGridEvent: ${JSON.stringify(typeof eventGridEvent)}`);
  context.log(`eventGridEvent: ${JSON.stringify(eventGridEvent)}`);

  const provider = new BasicTracerProvider();
  const exporter = new AzureMonitorTraceExporter({
    connectionString:
      process.env["APPLICATIONINSIGHTS_CONNECTION_STRING"],
  });
  provider.addSpanProcessor(new SimpleSpanProcessor(exporter));
  provider.register();
  const tracer = opentelemetry.trace.getTracer("example-basic-tracer-node");

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
  // opentelemetry.propagation.setGlobalPropagator(propagator);

  tracer.startActiveSpan('Process EventGridEvents', options, async (span) => {
    context.log(`ctx: ${JSON.stringify(ctx)}`);
    span.end();
  });
};

export default eventGridTrigger;
