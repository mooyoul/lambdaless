# @lambdaless/proxy

An AWS CDK construct of Lambdaless HTTP Proxy.

### Why?

You may need to proxy requests, due to following reasons:

- Blocked Access (e.g. Blocked Source IP, Blocked Source CIDR ...)
- Accelerate server access (e.g. Make open graph crawler to faster)
- Secure insecure resources (e.g. Prevent [Mixed Content](https://developers.google.com/web/fundamentals/security/prevent-mixed-content/what-is-mixed-content?hl=en) issue) 
 
 
![Example](./assets/blocked.png) 

At [Vingle](https://www.vingle.net), We have to proxy certain open graph scrap requests to bypass geo restrictions of some websites.

Previously, We had simple lambda function that proxies requests. 

For example: 

```typescript
import axios from "axios";

export async function handler(event: Event) {
  const { url } = event.body;
 
  const response = await axios({
    method: "GET",
    url,
    headers: {
      "User-Agent": "facebookexternalhit/1.1"
    },
    timeout: 15,
  });

  return { 
    statusCode: response.status,
    headers: response.headers,
    body: res.data,
  };
}
```

It worked pretty good, but Lambda based proxy has some downsides:

- We have to monitor Lambda invocations, latencies, failures ...
- We have to pay for Lambda Cost - Most time of lambda invocation just waits for response from upstream
- We have to maintenance Lambda function and dependencies - Node.js Lambda runtime reaches EOL, New version of axios is released ...   

So we decided to remove Lambda usage in this use-case, and We could make this better!

### How?

Just use HTTP_PROXY integration with pass-through option and abstract proxy endpoints by using AWS CDK. 


### Getting Started

Install `@lambdaless/proxy` construct package from NPM:

```bash
$ npm i @lambdaless/proxy --save
```

Add construct to your AWS CDK based Stack:

```typescript

import * as cdk from "@aws-cdk/core";

import * as apigw from "@aws-cdk/aws-apigateway";
import { Proxy } from "@lambdaless/proxy";

export class MyStack extends cdk.Stack {
  public constructor(scope: cdk.App, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Create or reference pre-existing API Gateway RestAPI
    const api = new apigw.RestApi(this, "API", {
      restApiName: "my-awesome-apigw",
      endpointTypes: [apigw.EndpointType.EDGE],
      deployOptions: {
        loggingLevel: apigw.MethodLoggingLevel.INFO,
      },
    });

    // Create Proxy and Attach proxy to given API Gateway RestAPI target
    const proxyRoot = api.root.addResource("proxy");
    const proxy = new Proxy(this, "Proxy", {
      method: "GET",
      resource: proxyRoot.addResource("ipify"),
      endpointBaseUrl: "https://api.ipify.org",
      exact: true,
    });
  }
}
```

and then, Deploy your CDK App. Done! 🎉

### API

It's pass-through. Request/Response will be passed as-is. There's no modification except API Gateway's default behavior. (e.g. adding Request ID to headers) 


#### General

```typescript
const proxy = new Proxy(this, "Proxy", {
  method: "GET",
  resource: api.root.addResource("ipify"),
  endpointBaseUrl: "https://api.ipify.org",
  exact: true,
})
```

will result:

| Match? | Endpoint | Mapped to |
| -------- | --------- | ------- |
| Yes | https://API_ID.execute-api.REGION.amazonaws.com/prod/ipify | https://api.ipify.org/ |
| Yes | https://API_ID.execute-api.REGION.amazonaws.com/prod/ipify/ | https://api.ipify.org/ |
| Yes | https://API_ID.execute-api.REGION.amazonaws.com/prod/ipify/foo/bar?baz | https://api.ipify.org/foo/bar?baz |


#### Exact Match

Exact Match. If you familiar with NGiNX, Think it as  `=` operator in NGiNX location directive. 

```typescript
const proxy = new Proxy(this, "Proxy", {
  method: "GET",
  resource: api.root.addResource("ipify"),
  endpointBaseUrl: "https://api.ipify.org",
  exact: true,
})
```

will result:

| Match? | Endpoint | Mapped to |
| -------- | --------- | ------- |
| Yes | https://API_ID.execute-api.REGION.amazonaws.com/prod/ipify | https://api.ipify.org/ |
| Yes | https://API_ID.execute-api.REGION.amazonaws.com/prod/ipify/ | https://api.ipify.org/ |
| No | https://API_ID.execute-api.REGION.amazonaws.com/prod/ipify/foo/bar?baz | `-` (No Match) |


### Testing

Since there are no any business logic, Testing is not necessary.


### Debugging

![tester](./assets/tester.png)

Use API Gateway built-in API Tester. You can inspect full request/response and execution logs.

See: https://docs.aws.amazon.com/apigateway/latest/developerguide/how-to-test-method.html


### Challenges / Wishlists

##### "Dynamic" forward proxy

It would be nice if we can implement forward proxy

For example, 

- https://API_ID.execute-api.REGION.amazonaws.com/prod/https://www.example.com/foo/bar/baz

will proxy requests to

- https://www.example.com/foo/bar/baz

I haven't tried this so let me know it can be implemented in Lambdaless, 
or you can try my alternative project: [proxyfront](https://github.com/mooyoul/proxyfront) - Another approach to implement forward proxy using Lambda@Edge.
