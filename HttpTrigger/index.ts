import { EventGridPublisherClient, AzureKeyCredential } from "@azure/eventgrid";
import { AzureFunction, Context, HttpRequest } from "@azure/functions"

interface EventGridData {
  message: string;
  traceparent: string;
  tracestate: string;
}

const httpTrigger: AzureFunction = async function (context: Context, req: HttpRequest): Promise<void> {
  context.log('HTTP trigger function processed a request.');
  const name = (req.query.name || (req.body && req.body.name));
  const responseMessage = name
    ? "Hello, " + name + ". This HTTP triggered function executed successfully."
    : "This HTTP triggered function executed successfully. Pass a name in the query string or in the request body for a personalized response.";
  context.log(`function context.traceContext: ${JSON.stringify(context.traceContext)}`);
  // context.log(`appInsights.getCorrelationContext(): ${JSON.stringify(appInsights.getCorrelationContext())}`);
  
  const data: EventGridData = {
    message: responseMessage,
    traceparent: context.traceContext.traceparent,
    tracestate: context.traceContext.tracestate
  }

  const client = new EventGridPublisherClient(
    process.env["EVENTGRID_ENDPOINT"],
    "EventGrid",
    new AzureKeyCredential(process.env["EVENTGRID_ACCESS_KEY"])
  );

  await client.send([
    {
      eventType: "Azure.Sdk.SampleEvent",
      subject: "Event Subject",
      dataVersion: "1.0",
      data: data
    }
  ]);

  context.res = {
    // status: 200, /* Defaults to 200 */
    body: data
  };

};

export default httpTrigger;