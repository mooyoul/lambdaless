import * as cdk from "@aws-cdk/core";

import * as apigw from "@aws-cdk/aws-apigateway";
import * as iam from "@aws-cdk/aws-iam";
import * as firehose from "@aws-cdk/aws-kinesisfirehose";

import { stripIndent } from "common-tags";

export interface SendgridEventCollectorProps {
  readonly api: apigw.RestApi;
  readonly resource: apigw.Resource;
  readonly deliveryStream: firehose.CfnDeliveryStream;
}

export class SendgridEventCollector extends cdk.Construct {
  public readonly api: apigw.RestApi;
  public readonly resource: apigw.Resource;
  public readonly deliveryStream: firehose.CfnDeliveryStream;
  public readonly executionRole: iam.Role;

  public constructor(scope: cdk.Construct, id: string, props: SendgridEventCollectorProps) {
    super(scope, id);

    // API Gateway for collecting incoming sendgrid webhook events
    this.api = props.api;

    // API Resource for collecting incoming sendgrid webhook events
    this.resource = props.resource;

    // Kinesis Firehose delivery stream for collecting data to file
    this.deliveryStream = props.deliveryStream;

    // IAM Role for accessing upper delivery stream from API Gateway side
    this.executionRole = new iam.Role(this, "APIExecutionRole", {
      assumedBy: new iam.ServicePrincipal("apigateway.amazonaws.com"),
      inlinePolicies: {
        "allow-firehose-access": new iam.PolicyDocument({
          statements: [new iam.PolicyStatement({
            actions: ["firehose:PutRecord"],
            effect: iam.Effect.ALLOW,
            resources: [this.deliveryStream.attrArn],
          })],
        }),
      }
    });

    // A JSONSchema models to validate request payload
    // @note This model validates common fields only
    // @see https://sendgrid.com/docs/for-developers/tracking-events/event/#events
    // @see https://sendgrid.com/docs/for-developers/tracking-events/event/#event-objects
    const sendGridWebhookPayloadModel = this.api.addModel("SendGridWebhookPayloadModel", {
      contentType: "application/json",
      modelName: "SendGridWebhookPayload",
      schema: {
        title: "createComment",
        type: apigw.JsonSchemaType.ARRAY,
        items: {
          type: apigw.JsonSchemaType.OBJECT,
          required: ["email", "timestamp", "smtp-id", "event", "sg_event_id", "sg_message_id"],
          properties: {
            email: {
              type: apigw.JsonSchemaType.STRING,
              format: "email",
            },
            // "timestamp":1513299569,
            timestamp: {
              type: apigw.JsonSchemaType.INTEGER,
            },
            // "smtp-id":"<14c5d75ce93.dfd.64b469@ismtpd-555>",
            ["smtp-id"]: {
              type: apigw.JsonSchemaType.STRING,
            },
            // "event":"open",
            event: {
              type: apigw.JsonSchemaType.STRING,
            },
            // "category":"cat facts",
            category: {
              type: apigw.JsonSchemaType.STRING,
            },
            // "sg_event_id":"FOTFFO0ecsBE-zxFXfs6WA==",
            sg_event_id: {
              type: apigw.JsonSchemaType.STRING,
            },
            // "sg_message_id":"14c5d75ce93.dfd.64b469.filter0001.16648.5515E0B88.0",
            sg_message_id: {
              type: apigw.JsonSchemaType.STRING,
            },
          }
        },
      },
    });

    // RequestValidator to validate requests
    const validator = new apigw.RequestValidator(this, "RequestValidator", {
      restApi: this.api,
      validateRequestParameters: true,
      validateRequestBody: true,
    });

    // Implement `createComment` API using AWS Integration
    //
    // @note SendGrid Events post every 30 seconds or when the batch size reaches 768 kilobytes -
    // whichever occurs first.
    this.resource.addMethod("POST", new apigw.AwsIntegration({
      service: "firehose",
      action: "PutRecord",
      options: {
        credentialsRole: this.executionRole,
        passthroughBehavior: apigw.PassthroughBehavior.NEVER,
        // Don't concatenate two or more base64 strings to form the data fields of your records.
        // Instead, concatenate the raw data, then perform base64 encoding.
        requestTemplates: {
          "application/json": stripIndent`
            #set($end = $input.path("$").size() - 1)
            #set($data = "")

            #foreach($index in [0..$end])
              #set($path = "$.[$index]")
              #set($item = $input.json($path))
              #set($data = "$data$item\n")
            #end
            {
                "DeliveryStreamName": "${this.deliveryStream.deliveryStreamName}",
                "Record": {
                  "Data": "$util.base64Encode($data)"
                }
            }
          `,
        },
        integrationResponses: [{
          // Pass-through successful responses
          statusCode: "200",
          responseParameters: {
            "method.response.header.Content-Type": "'application/json'",
          },
          responseTemplates: {
            "application/json": "$input.body",
            "application/x-amz-json-1.0": "$input.body",
          },
        }, {
          // Pass-through error responses
          selectionPattern: "[45][0-9][0-9]",
          statusCode: "422",
          responseParameters: {
            "method.response.header.Content-Type": "'application/json'",
          },
          responseTemplates: {
            // Pass-through
            "application/json": "$input.body",
            "application/x-amz-json-1.0": "$input.body",
          },
        }],
      },
    }), {
      requestModels: {
        "application/json": sendGridWebhookPayloadModel,
      },
      requestValidator: validator,
      methodResponses: [{
        statusCode: "200",
        responseParameters: {
          "method.response.header.Content-Type": true,
        },
      }, {
        statusCode: "422",
        responseParameters: {
          "method.response.header.Content-Type": true,
        },
      }]
    });
  }
}
