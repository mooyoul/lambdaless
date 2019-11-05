# Lambdaless Email Subscription Service

A simple email subscription service that implemented without Lambda usage  

### Why?

You may need to create "Email Subscribe" feature, especially your product is in early stage. You'll build an promotion website.

Usually, we have to build API to register email subscriptions. Like this:

![Example](./assets/example.png)
 
Previously, We had simple lambda function that stores email subscription. 

For example: 

```typescript
import { Decorator, Query, Table } from "dynamo-types";
import * as Joi from "joi";

const RequestModelSchema = Joi.object({
  email: Joi.string().email().required(),
}).required();

@Decorator.Table({ name: "my_promotion_subscriptions" })
class Subscription extends Table {
  @Decorator.HashPrimaryKey("email")
  public static readonly primaryKey: Query.HashPrimaryKey<Subscription, string>;
                                                                    
  @Decorator.Writer()    
  public static readonly writer: Query.Writer<Subscription>;

  // Query Helpers
  public static create(email: string) {
    const model = new this();
    model.email = email;
    model.createdAt = Date.now();

    return model;
  }

  @Decorator.Attribute({ name: "e" })                              
  public email: string;
                                                                    
  @Decorator.Attribute({ name: "ca" })
  public createdAt: number;
}

export async function handler(event: Event) {
  // Validate Request
  const { error, value } = RequestModelSchema.validate(event.body);

  if (error) {
    return {
      statusCode: 422,
      headers: {
        "Content-Type": "application/json",      
      },
      body: JSON.stringify({
        error: { code: "INVALID_PARAMETER", message: error.message },
      }),
    }; 
  }
  
  // Store subscription data
  const subscription = Subscription.create(value.email);
  await subscription.save();
 
  return { 
    statusCode: 200,
    headers: {
        "Content-Type": "application/json",      
    },
    body: JSON.stringify({ data: { ok: true } }),
  };
}
```

It worked pretty good, but Lambda based API implementation has some downsides:

- We have to monitor Lambda invocations, latencies, failures ...
- We have to pay for Lambda Cost - Lambda just do simple tasks (Validate request, Write DynamoDB item...)
- We have to maintenance Lambda function and dependencies - Node.js Lambda runtime reaches EOL, New version of AWS SDK is released ...   

So we decided to remove Lambda usage in this use-case, and We could make this better!

### How?

Just use AWS Service integration with API Gateway built-ins (Request Validation, Request Template...) 

### Getting Started

Clone lambdaless repository:

```bash
$ git clone https://github.com/mooyoul/lambdaless.git
```

Navigate to `email-subscription` directory:

```bash
$ cd lambdaless/email-subscription
```

Install required dependencies:

```bash
$ npm ci
``` 

Edit service configurations:

```bash
$ vi src/stack.ts
```

Deploy

```bash
$ npm run cdk -- deploy
$ # OR
$ env AWS_PROFILE=myprofile AWS_REGION=us-east-1 npm run cdk -- deploy
```

Done! 🎉

### Example

```typescript
const service = new SubscriptionService(this, "Service", {
    apiName: "lambdaless-subscription",
    endpointType: EndpointType.EDGE,
    tableName: "lambdaless-subscriptions",
});
```

This will create an API that stores given email address to DynamoDB Table. 


### Testing

Since there are no any business logic, Testing is not necessary.


### Debugging

![tester](./assets/tester.png)

Use API Gateway built-in API Tester. You can inspect full request/response and execution logs.

See: https://docs.aws.amazon.com/apigateway/latest/developerguide/how-to-test-method.html


### Troubleshoot

##### Deploy failure with CloudWatch Logs Role message

![error](./assets/failure.png)

> CloudWatch Logs role ARN must be set in account settings to enable logging.

In this case, You should configure IAM Role for logging.

Follow below two steps in [this document](https://aws.amazon.com/premiumsupport/knowledge-center/api-gateway-cloudwatch-logs/):

- "Create an IAM role for logging to CloudWatch" section
- "Add the IAM role in the API Gateway console"

> NOTE: "Enable logging for your API and stage" section is not required.

