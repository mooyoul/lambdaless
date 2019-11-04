#!/usr/bin/env node
import * as cdk from "@aws-cdk/core";

import { ProxyStack } from "./stack";

const app = new cdk.App();
new ProxyStack(app, "LambdalessProxy", {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
}); // tslint:disable-line
