import * as cdk from "@aws-cdk/core";

import * as apigw from "@aws-cdk/aws-apigateway";
import * as ddb from "@aws-cdk/aws-dynamodb";
import * as iam from "@aws-cdk/aws-iam";

import { stripIndent } from "common-tags";

export interface SubscriptionServiceProps {
  readonly api: apigw.RestApi;
  readonly resource: apigw.Resource;
  readonly tableName: string;
}

export class EmailSubscriptionService extends cdk.Construct {
  public readonly api: apigw.RestApi;
  public readonly resource: apigw.Resource;
  public readonly table: ddb.Table;
  public readonly executionRole: iam.Role;

  public constructor(scope: cdk.Construct, id: string, props: SubscriptionServiceProps) {
    super(scope, id);

    // API Gateway for Subscription API
    this.api = props.api;

    // API Resource for Subscription API
    this.resource = props.resource;

    // DynamoDB Table for saving subscriptions
    this.table = new ddb.Table(this, "Table", {
      tableName: props.tableName,
      partitionKey: {
        name: "email",
        type: ddb.AttributeType.STRING,
      },
      // Enable "Serverless Mode"
      billingMode: ddb.BillingMode.PAY_PER_REQUEST,
    });

    // IAM Role for accessing upper DynamoDB Table from API Gateway side
    this.executionRole = new iam.Role(this, "APIExecutionRole", {
      assumedBy: new iam.ServicePrincipal("apigateway.amazonaws.com"),
      externalIds: [cdk.Aws.ACCOUNT_ID],
      inlinePolicies: {
        "allow-ddb-access": new iam.PolicyDocument({
          statements: [new iam.PolicyStatement({
            actions: ["dynamodb:PutItem"],
            effect: iam.Effect.ALLOW,
            resources: [this.table.tableArn],
          })],
        }),
      }
    });

    // A JSONSchema model to validate request payload
    const requestModel = this.api.addModel("SubscriptionRequestModel", {
      contentType: "application/json",
      modelName: "SubscriptionRequest",
      schema: {
        title: "subscribeRequest",
        type: apigw.JsonSchemaType.OBJECT,
        required: ["email"],
        properties: {
          email: {
            type: apigw.JsonSchemaType.STRING,
            format: "email",
            minLength: 1,
            maxLength: 256,
          },
        },
      },
    });

    // RequestValidator to validate requests
    const validator = new apigw.RequestValidator(this, "RequestValidator", {
      restApi: this.api,
      validateRequestBody: true,
    });

    // Implement `createSubscription` API using AWS Integration
    this.resource.addMethod("POST", new apigw.AwsIntegration({
      service: "dynamodb",
      integrationHttpMethod: "POST",
      action: "PutItem",
      options: {
        credentialsRole: this.executionRole,
        passthroughBehavior: apigw.PassthroughBehavior.NEVER,
        requestTemplates: {
          "application/json": stripIndent`
            {
                "TableName": "${this.table.tableName}",
                "Item": {
                    "email": {
                        "S": "$input.path('$.email')"
                    },
                    "createdAt": {
                        "N": "$context.requestTimeEpoch"
                    }
                },
                "ConditionExpression": "attribute_not_exists(email)"
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
        "application/json": requestModel,
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
