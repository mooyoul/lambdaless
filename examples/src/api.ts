import * as cdk from "@aws-cdk/core";

import * as apigw from "@aws-cdk/aws-apigateway";
import * as iam from "@aws-cdk/aws-iam"; // only required for collector demo
import * as firehose from "@aws-cdk/aws-kinesisfirehose"; // only required for collector demo
import * as s3 from "@aws-cdk/aws-s3"; // only required for collector demo

import { CommentService } from "../../comment";
import { EmailSubscriptionService } from "../../email-subscription";
import { Proxy } from "../../proxy";
import { SendgridEventCollector } from "../../sendgrid-event-collector";

export class APIStack extends cdk.Stack {
  public constructor(scope: cdk.App, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    /**
     * Base Resources
     */
    // API Gateway for Proxy Endpoint
    const api = new apigw.RestApi(this, "API", {
      restApiName: "lambdaless-example",
      endpointTypes: [apigw.EndpointType.EDGE],
      deployOptions: {
        loggingLevel: apigw.MethodLoggingLevel.INFO,
      },
    });

    /**
     * Comment Service
     */
    // Create Email Subscription Service and Attach API to given API Gateway RestAPI target
    const commentService = new CommentService(this, "CommentService", {
      api,
      resource: api.root.addResource("comments"),
      tableName: "lambdaless-comments",
    });

    /**
     * Email Subscription Service
     */
    // Create Email Subscription Service and Attach API to given API Gateway RestAPI target
    const emailSubscriptionService = new EmailSubscriptionService(this, "EmailSubscriptionService", {
      api,
      resource: api.root.addResource("subscriptions"),
      tableName: "lambdaless-email-subscriptions",
    });

    /**
     * Proxy
     */
    // Create Proxy and Attach proxy to given API Gateway RestAPI target
    const proxyRoot = api.root.addResource("proxy");
    const proxy = new Proxy(this, "Proxy", {
      method: "GET",
      resource: proxyRoot.addResource("ipify"),
      endpointBaseUrl: "https://api.ipify.org",
      exact: true,
    });

    // Expose Proxy Endpoint to CFN Output. This is not required. Just for demo.
    // tslint:disable-next-line
    new cdk.CfnOutput(this, `IpifyProxyEndpoint`, { value: api.urlForPath(proxy.resource.path) });

    /**
     * Additional base resources for Webhook event collectors
     */
    const collectorBucket = new s3.Bucket(this, "CollectorBucket", {
      bucketName: "lambdaless-collector-example",
    });

    /**
     * SendGrid Events Webhook Collector
     */
    const sendgridDeliveryStreamRole = new iam.Role(this, "SendgridDeliveryStreamRole", {
      assumedBy: new iam.ServicePrincipal("firehose.amazonaws.com"),
      externalIds: [cdk.Aws.ACCOUNT_ID],
      inlinePolicies: {
        "allow-firehose-access": new iam.PolicyDocument({
          statements: [new iam.PolicyStatement({
            actions: [
              "s3:AbortMultipartUpload",
              "s3:GetBucketLocation",
              "s3:GetObject",
              "s3:ListBucket",
              "s3:ListBucketMultipartUploads",
              "s3:PutObject"
            ],
            effect: iam.Effect.ALLOW,
            resources: [
              collectorBucket.bucketArn,
              `${collectorBucket.bucketArn}/*`,
            ],
          })],
        }),
      }
    });

    const sendgridDeliveryStream = new firehose.CfnDeliveryStream(this, "SendgridEventDeliveryStream", {
      deliveryStreamName: "lambdaless-sendgrid-events",
      deliveryStreamType: "DirectPut",
      s3DestinationConfiguration: {
        bucketArn: collectorBucket.bucketArn,
        bufferingHints: {
          intervalInSeconds: cdk.Duration.minutes(5).toSeconds(),
          sizeInMBs: 10,
        },
        compressionFormat: "GZIP",
        roleArn: sendgridDeliveryStreamRole.roleArn,
      },
    });

    // Create Sendgrid Event Collector and Attach API to given API Gateway RestAPI target
    const sendgridEventCollector = new SendgridEventCollector(this, "SendgridEventCollector", {
      api,
      resource: api.root.addResource("sendgrid"),
      deliveryStream: sendgridDeliveryStream,
    });
  }
}
