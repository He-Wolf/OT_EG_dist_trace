import { EventGridPublisherClient, AzureKeyCredential } from "@azure/eventgrid";
import { AzureFunction, Context, HttpRequest, TraceContext } from "@azure/functions";
import {
  extractContextFromTraceContext,
  injectCtxToTraceContext,
  EventGridData,
  getTracer,
  getActiveContext
} from "../shared/opentelemetry";

const httpTrigger: AzureFunction = async function (context: Context, req: HttpRequest): Promise<void> {
  context.log('HTTP trigger function processed a request.');
  const name = (req.query.name || (req.body && req.body.name));
  const responseMessage = name
    ? "Hello, " + name + ". This HTTP triggered function executed successfully."
    : "This HTTP triggered function executed successfully. Pass a name in the query string or in the request body for a personalized response.";
  context.log(`function context.traceContext: ${JSON.stringify(context.traceContext)}`);
  // context.log(`appInsights.getCorrelationContext(): ${JSON.stringify(appInsights.getCorrelationContext())}`);


  const tracer = getTracer("EventGridProducer");

  const ctx = extractContextFromTraceContext(context.traceContext);

  let data: EventGridData;

  tracer.startActiveSpan('Send EventGrid event', {}, ctx, async (span) => {
    const client = new EventGridPublisherClient(
      process.env["EVENTGRID_ENDPOINT"],
      "EventGrid",
      new AzureKeyCredential(process.env["EVENTGRID_ACCESS_KEY"])
    );

    const traceContext: TraceContext = {
      traceparent: undefined,
      tracestate: undefined,
      attributes: undefined
    };
  
    injectCtxToTraceContext(getActiveContext(), traceContext);
  
    data = {
      message: responseMessage,
      traceparent: traceContext.traceparent,
      tracestate: traceContext.tracestate
    };

    await client.send([
      {
        eventType: "Azure.Sdk.SampleEvent",
        subject: "Event Subject",
        dataVersion: "1.0",
        data: data
      }
    ]);
    span.end();
  });

  context.res = {
    // status: 200, /* Defaults to 200 */
    body: data
  };

};

export default httpTrigger;