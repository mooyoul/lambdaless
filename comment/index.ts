import * as cdk from "@aws-cdk/core";

import * as apigw from "@aws-cdk/aws-apigateway";
import * as ddb from "@aws-cdk/aws-dynamodb";
import * as iam from "@aws-cdk/aws-iam";

import { stripIndent } from "common-tags";

export interface CommentServiceProps {
  readonly api: apigw.RestApi;
  readonly resource: apigw.Resource;
  readonly tableName: string;
}

export class CommentService extends cdk.Construct {
  public readonly api: apigw.RestApi;
  public readonly resource: apigw.Resource;
  public readonly table: ddb.Table;
  public readonly indexName: string;
  public readonly executionRole: iam.Role;

  public constructor(scope: cdk.Construct, id: string, props: CommentServiceProps) {
    super(scope, id);

    // API Gateway for Comment API
    this.api = props.api;

    // API Resource for Comment API
    this.resource = props.resource;

    // DynamoDB Table for saving comments
    this.table = new ddb.Table(this, "Table", {
      tableName: props.tableName,
      partitionKey: {
        name: "id",
        type: ddb.AttributeType.STRING,
      },
      // Enable "Serverless Mode"
      billingMode: ddb.BillingMode.PAY_PER_REQUEST,
    });

    // DynamoDB GSI for querying comments
    this.indexName = `${props.tableName}_list_query`;

    this.table.addGlobalSecondaryIndex({
      indexName: this.indexName,
      partitionKey: {
        name: "parent_id",
        type: ddb.AttributeType.STRING,
      },
      sortKey: {
        name: "created_at",
        type: ddb.AttributeType.NUMBER,
      },
    });

    // IAM Role for accessing upper DynamoDB Table from API Gateway side
    this.executionRole = new iam.Role(this, "APIExecutionRole", {
      assumedBy: new iam.ServicePrincipal("apigateway.amazonaws.com"),
      externalIds: [cdk.Aws.ACCOUNT_ID],
      inlinePolicies: {
        "allow-ddb-access": new iam.PolicyDocument({
          statements: [new iam.PolicyStatement({
            actions: ["dynamodb:PutItem", "dynamodb:Query"],
            effect: iam.Effect.ALLOW,
            resources: [this.table.tableArn, `${this.table.tableArn}/index/${this.indexName}`],
          })],
        }),
      }
    });

    // A JSONSchema model to validate request payload
    const createCommentRequestModel = this.api.addModel("CreateCommentRequestModel", {
      contentType: "application/json",
      modelName: "CreateCommentRequest",
      schema: {
        title: "createComment",
        type: apigw.JsonSchemaType.OBJECT,
        required: ["parent_id", "name", "content"],
        properties: {
          parent_id: {
            type: apigw.JsonSchemaType.STRING,
            minLength: 1,
            maxLength: 256,
          },
          name: {
            type: apigw.JsonSchemaType.STRING,
            minLength: 1,
            maxLength: 64,
          },
          content: {
            type: apigw.JsonSchemaType.STRING,
            minLength: 1,
            maxLength: 2048,
          },
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
                    "id": {
                      "S": "$context.requestId"
                    },
                    "parent_id": {
                        "S": "$input.path('$.parent_id')"
                    },
                    "name": {
                        "S": "$input.path('$.name')"
                    },
                    "content": {
                        "S": "$input.path('$.content')"
                    },
                    "created_at": {
                        "N": "$context.requestTimeEpoch"
                    }
                },
                "ConditionExpression": "attribute_not_exists(id)"
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
        "application/json": createCommentRequestModel,
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

    // Implement `listComments` API using AWS Integration
    this.resource.addMethod("GET", new apigw.AwsIntegration({
      service: "dynamodb",
      integrationHttpMethod: "POST",
      action: "Query",
      options: {
        credentialsRole: this.executionRole,
        passthroughBehavior: apigw.PassthroughBehavior.NEVER,
        requestTemplates: {
          "application/json": stripIndent`
            {
                #set($parentId = $method.request.querystring.parent_id)

                #set($count = 30)
                #if($!method.request.querystring.count != '')
                  #set($count = $method.request.querystring.count)
                #end

                #set($sortBy = "oldest")
                #if($method.request.querystring.sort_by == "oldest")
                  #set($sortBy = "oldest")
                #elseif($method.request.querystring.sort_by == "latest")
                  #set($sortBy = "latest")
                #end

                #set($after = false)
                #if($!method.request.querystring.after != '')
                  #set($after = $method.request.querystring.after)
                #end

                "TableName": "${this.table.tableName}",
                "IndexName": "${this.indexName}",
                #if($sortBy == "oldest")
                  "ScanIndexForward": true,
                  #if($after)
                    "KeyConditionExpression": "parent_id = :hash AND created_at > :range",
                    "ExpressionAttributeValues": {
                        ":hash": {
                          "S": "$parentId"
                        },
                        ":range": {
                          "N": "$after"
                        }
                    },
                  #else
                    "KeyConditionExpression": "parent_id = :hash",
                    "ExpressionAttributeValues": {
                        ":hash": {
                          "S": "$parentId"
                        }
                    },
                  #end
                #else
                  "ScanIndexForward": false,
                  #if($after)
                    "KeyConditionExpression": "parent_id = :hash AND created_at < :range",
                    "ExpressionAttributeValues": {
                        ":hash": {
                          "S": "$parentId"
                        },
                        ":range": {
                          "N": "$after"
                        }
                    },
                  #else
                    "KeyConditionExpression": "parent_id = :hash",
                    "ExpressionAttributeValues": {
                        ":hash": {
                          "S": "$parentId"
                        }
                    },
                  #end
                #end
                "Limit": $count
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
            "application/x-amz-json-1.0": stripIndent`
              #set($inputRoot = $input.path('$'))
              #set($comments = $inputRoot.Items)
              #set($hasNext = false)
              #if($!input.path('$.LastEvaluatedKey') != '')
                #set($hasNext = true)
              #end

              #set($lastComment = false)
              #if($comments.size() > 0)
                #set($lastCommentIndex = $comments.size() - 1)
                #set($lastComment = $comments[$lastCommentIndex])
              #end
              {
                  "data": [
                      #foreach($comment in $comments) {
                          "id": "$comment.id.S",
                          "name": "$comment.name.S",
                          "content": "$comment.content.S",
                          "created_at": $comment.created_at.N
                      }#if($foreach.hasNext),#end
                      #end
                  ],
                  "paging": {
                    #if($hasNext)
                      "after": "$lastComment.created_at.N"
                    #end
                  }
              }
            `,
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
      requestValidator: validator,
      requestParameters: {
        "method.request.querystring.parent_id": true,
        "method.request.querystring.sort_by": false,
        "method.request.querystring.count": false,
        "method.request.querystring.after": false,
      },
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
