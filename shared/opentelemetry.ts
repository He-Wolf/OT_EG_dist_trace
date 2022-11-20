
import * as opentelemetry from "@opentelemetry/api";
import { NodeTracerProvider, BatchSpanProcessor } from "@opentelemetry/sdk-trace-node";
import { AzureMonitorTraceExporter } from "@azure/monitor-opentelemetry-exporter";
import { W3CTraceContextPropagator } from "@opentelemetry/core";
import { Resource } from "@opentelemetry/resources";
import { SemanticResourceAttributes } from "@opentelemetry/semantic-conventions";
import { TraceContext } from "@azure/functions";


export interface EventGridData {
  message: string;
  traceparent: string;
  tracestate: string;
};

const resource =
  Resource.default().merge(
    new Resource({
      [SemanticResourceAttributes.FAAS_NAME]: "AZ function name", //get function name
      [SemanticResourceAttributes.FAAS_VERSION]: "AZ function version", // get other function data
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

const propagator = new W3CTraceContextPropagator();

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

export function getTracer(name: string) {
  return opentelemetry.trace.getTracer(name);
}

export function extractContextFromTraceContext(traceContext: TraceContext) {
  return propagator.extract(opentelemetry.ROOT_CONTEXT, traceContext, eventgridGetter);
}

export function injectCtxToTraceContext(ctx: opentelemetry.Context, traceContext: TraceContext) {
  return propagator.inject(ctx, traceContext, eventgridSetter);
}

export function getSpanFromContext(context: opentelemetry.Context) {
  return opentelemetry.trace.getSpan(context);
}

export function getActiveContext() {
  return opentelemetry.context.active();
}