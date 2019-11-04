#!/usr/bin/env node
import * as cdk from "@aws-cdk/core";

import { SubscriptionServiceStack } from "./stack";

const app = new cdk.App();
new SubscriptionServiceStack(app, "LambdalessEmailSubscription", {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
}); // tslint:disable-line
