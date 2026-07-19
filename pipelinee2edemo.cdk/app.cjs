const cdk = require("aws-cdk-lib");
const cloudfront = require("aws-cdk-lib/aws-cloudfront");
const origins = require("aws-cdk-lib/aws-cloudfront-origins");
const iam = require("aws-cdk-lib/aws-iam");
const lambda = require("aws-cdk-lib/aws-lambda");
const s3 = require("aws-cdk-lib/aws-s3");
const ssm = require("aws-cdk-lib/aws-ssm");
const cr = require("aws-cdk-lib/custom-resources");

const app = new cdk.App();
const environmentName = app.node.tryGetContext("environmentName") || "beta";
if (!/^[a-z][a-z0-9-]{0,30}$/.test(environmentName)) {
  throw new Error("environmentName must be a valid environment ID");
}

const account = process.env.CDK_DEFAULT_ACCOUNT || "516703876684";
const region = process.env.CDK_DEFAULT_REGION || "us-east-1";
const commitId = process.env.PIPELINE_COMMIT_ID || "local";
const prefix = `pipeline-e2e-demo-${environmentName}`;

const coreStack = new cdk.Stack(app, "PipelineE2EDemoCore", {
  env: { account, region },
  stackName: `${prefix}-core`,
});
new ssm.StringParameter(coreStack, "StateParameter", {
  parameterName: `/pipeline-e2e-demo/${environmentName}/state`,
  stringValue: commitId,
});
new cdk.CfnOutput(coreStack, "StateParameterName", {
  value: `/pipeline-e2e-demo/${environmentName}/state`,
});
const lambdaArtifactBucket = s3.Bucket.fromBucketName(
  coreStack,
  "LambdaArtifactBucket",
  `${prefix}-${region}-lambda-artifacts-${account}`,
);
const apiFunction = new lambda.Function(coreStack, "ApiFunction", {
  code: lambda.Code.fromBucket(
    lambdaArtifactBucket,
    `${commitId}/lambda.zip`,
  ),
  functionName: `${prefix}-api`,
  handler: "index.handler",
  runtime: lambda.Runtime.NODEJS_22_X,
});
new cdk.CfnOutput(coreStack, "ApiFunctionName", {
  value: apiFunction.functionName,
});

const webStack = new cdk.Stack(app, "PipelineE2EDemoWeb", {
  env: { account, region },
  stackName: `${prefix}-web`,
});
webStack.addDependency(coreStack);

const webBucket = new s3.Bucket(webStack, "WebBucket", {
  autoDeleteObjects: true,
  blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
  bucketName: `${prefix}-web-${account}`,
  encryption: s3.BucketEncryption.S3_MANAGED,
  enforceSSL: true,
  removalPolicy: cdk.RemovalPolicy.DESTROY,
});
const distribution = new cloudfront.Distribution(webStack, "WebDistribution", {
  defaultBehavior: {
    origin: origins.S3BucketOrigin.withOriginAccessControl(webBucket),
    viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
  },
  defaultRootObject: "index.html",
});

const runtimeConfig = new cr.AwsCustomResource(webStack, "RuntimeConfig", {
  onCreate: {
    action: "putObject",
    parameters: {
      Body: `window.PIPELINE_E2E_CONFIG = { environmentName: "${environmentName}" };\n`,
      Bucket: webBucket.bucketName,
      CacheControl: "no-store, max-age=0",
      ContentType: "application/javascript; charset=utf-8",
      Key: "config.js",
    },
    physicalResourceId: cr.PhysicalResourceId.of(`${prefix}-runtime-config`),
    service: "S3",
  },
  onUpdate: {
    action: "putObject",
    parameters: {
      Body: `window.PIPELINE_E2E_CONFIG = { environmentName: "${environmentName}" };\n`,
      Bucket: webBucket.bucketName,
      CacheControl: "no-store, max-age=0",
      ContentType: "application/javascript; charset=utf-8",
      Key: "config.js",
    },
    physicalResourceId: cr.PhysicalResourceId.of(`${prefix}-runtime-config`),
    service: "S3",
  },
  policy: cr.AwsCustomResourcePolicy.fromStatements([
    new iam.PolicyStatement({
      actions: ["s3:PutObject"],
      resources: [webBucket.arnForObjects("config.js")],
    }),
  ]),
});
runtimeConfig.node.addDependency(webBucket);

const deployGate = new cr.AwsCustomResource(webStack, "DeployGate", {
  onCreate: {
    action: "getParameter",
    parameters: {
      Name: `/pipeline-e2e-demo/${environmentName}/allow-deploy`,
    },
    physicalResourceId: cr.PhysicalResourceId.of(`${prefix}-${commitId}`),
    service: "SSM",
  },
  onUpdate: {
    action: "getParameter",
    parameters: {
      Name: `/pipeline-e2e-demo/${environmentName}/allow-deploy`,
    },
    physicalResourceId: cr.PhysicalResourceId.of(`${prefix}-${commitId}`),
    service: "SSM",
  },
  policy: cr.AwsCustomResourcePolicy.fromStatements([
    new iam.PolicyStatement({
      actions: ["ssm:GetParameter"],
      resources: [
        `arn:${cdk.Aws.PARTITION}:ssm:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:parameter/pipeline-e2e-demo/${environmentName}/allow-deploy`,
      ],
    }),
  ]),
});
deployGate.node.addDependency(runtimeConfig);

new cdk.CfnOutput(webStack, "FrontendBucketName", {
  value: webBucket.bucketName,
});
new cdk.CfnOutput(webStack, "FrontendDistributionId", {
  value: distribution.distributionId,
});
new cdk.CfnOutput(webStack, "FrontendDomainName", {
  value: distribution.distributionDomainName,
});
