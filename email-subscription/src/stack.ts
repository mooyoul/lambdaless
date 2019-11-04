import * as cdk from "@aws-cdk/core";

import { EndpointType } from "@aws-cdk/aws-apigateway";
import { SubscriptionService } from "./subscription";

export class SubscriptionServiceStack extends cdk.Stack {
  constructor(scope: cdk.App, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const service = new SubscriptionService(this, "Service", {
      apiName: "lambdaless-subscription",
      endpointType: EndpointType.EDGE,
      tableName: "lambdaless-subscriptions",
    });
  }
}
