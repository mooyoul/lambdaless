import * as cdk from "@aws-cdk/core";

import { EndpointType } from "@aws-cdk/aws-apigateway";

import { Proxy } from "./proxy";

export class ProxyStack extends cdk.Stack {
  constructor(scope: cdk.App, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const proxy = new Proxy(this, "Proxy", {
      apiName: "lambdaless-proxy",
      endpointType: EndpointType.EDGE,
    });

    proxy.addProxy("ipify", "https://api.ipify.org", "GET");
  }
}
