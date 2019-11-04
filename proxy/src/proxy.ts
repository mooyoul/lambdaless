import * as cdk from "@aws-cdk/core";

import * as apigw from "@aws-cdk/aws-apigateway";

export interface ProxyProps {
  readonly apiName: string;
  readonly endpointType: apigw.EndpointType;
}

export class Proxy extends cdk.Construct {
  public readonly api: apigw.RestApi;

  constructor(scope: cdk.Construct, id: string, props: ProxyProps) {
    super(scope, id);

    // API Gateway for shorten url creation
    this.api = new apigw.RestApi(this, "API", {
      restApiName: props.apiName,
      endpointTypes: [props.endpointType],
      deployOptions: {
        loggingLevel: apigw.MethodLoggingLevel.INFO,
      },
    });
  }

  public addProxy(id: string, endpointBaseUrl: string, method: string = "GET") {
    const namespace = this.api.root.addResource(id);

    const proxyResource = new apigw.ProxyResource(this, `ProxyResource${method}${id}`, {
      parent: namespace,
      anyMethod: false,
    });

    proxyResource.addMethod(
      method,
      new apigw.HttpIntegration(`${endpointBaseUrl}/{proxy}`, {
        proxy: true,
        httpMethod: method,
        options: {
          requestParameters: {
            "integration.request.path.proxy": "method.request.path.proxy",
          },
        }
      }), {
        requestParameters: {
          "method.request.path.proxy": true,
        },
      },
    );

    // tslint:disable-next-line
    new cdk.CfnOutput(this, `ProxyEndpoint${method}${id}`, { value: this.api.urlForPath(proxyResource.path) });

    return proxyResource;
  }
}
