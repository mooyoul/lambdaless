#!/usr/bin/env node
import * as cdk from "@aws-cdk/core";

import { APIStack } from "./api";

const app = new cdk.App();
new APIStack(app, "Lambdaless", {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
}); // tslint:disable-line
