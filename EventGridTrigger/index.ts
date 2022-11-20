import { AzureFunction, Context } from "@azure/functions"
import { EventGridEvent } from "@azure/eventgrid";
import {
  extractContextFromTraceContext,
  EventGridData,
  getTracer,
  getSpanFromContext
} from "../shared/opentelemetry";


const eventGridTrigger: AzureFunction = async function (context: Context, eventGridEvent: EventGridEvent<EventGridData>): Promise<void> {
  context.log(`typeof eventGridEvent: ${JSON.stringify(typeof eventGridEvent)}`);
  context.log(`eventGridEvent: ${JSON.stringify(eventGridEvent)}`);

  const tracer = getTracer("EventGridConsumer");

  const ctxProd = extractContextFromTraceContext(
    {
      traceparent: eventGridEvent.data.traceparent,
      tracestate: eventGridEvent.data.tracestate,
      attributes: undefined
    }
  );

  const ctxProdSpan = getSpanFromContext(ctxProd);

  const options = {
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

