import * as cdk from "@aws-cdk/core";

import * as apigw from "@aws-cdk/aws-apigateway";

export interface ProxyProps {
  readonly resource: apigw.Resource;
  readonly method?: string;
  readonly endpointBaseUrl: string;
  readonly exact?: boolean;
}

export class Proxy extends cdk.Construct {
  public readonly resource: apigw.Resource;
  public readonly method: apigw.Method;

  public readonly proxyResource?: apigw.ProxyResource;
  public readonly proxyMethod?: apigw.Method;

  public readonly endpointBaseUrl: string;

  public constructor(scope: cdk.Construct, id: string, props: ProxyProps) {
    super(scope, id);

    this.resource = props.resource;
    this.endpointBaseUrl = props.endpointBaseUrl;

    this.method = this.resource.addMethod(
      props.method || "ANY",
      new apigw.HttpIntegration(this.endpointBaseUrl, {
        proxy: true,
        httpMethod: props.method
      }),
    );

    if (!props.exact) {
      this.proxyResource = new apigw.ProxyResource(this, "ProxyResource", {
        parent: props.resource,
        anyMethod: false, // Disable default ANY method creation
      });

      this.proxyMethod = this.proxyResource.addMethod(
        props.method || "ANY",
        new apigw.HttpIntegration(`${this.endpointBaseUrl}/{proxy}`, {
          proxy: true,
          httpMethod: props.method,
          options: {
            requestParameters: {
              "integration.request.path.proxy": "method.request.path.proxy",
            },
          }
        }), {
          requestParameters: {
            "method.request.path.proxy": false,
          },
        },
      );
    }
  }
}
