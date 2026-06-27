exports.handler = async () => ({
  statusCode: 200,
  body: JSON.stringify({
    service: "pipeline-platform-lambda-e2e",
    version: "lambda-plugin-e2e-20260626",
  }),
});
