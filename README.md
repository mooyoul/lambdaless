# Lambdaless

A Serverless architecture without Lambda usage ⚡️

### What's this?

Lambdaless is another way to implement service APIs. Simply think this as Serverless architecture without Lambda usage.

I'm not joking. This repository contains some real-world Lambdaless implementations.

A big thanks to AWS CDK. AWS CDK provided an easy way to implement Lambdaless. 
Their abstraction is super cool. also it finally stopped CloudFormation YAML nightmare.


### How?

Use API Gateway as first citizen in Serverless Architecture.

For further details, Please refer to my presentation: [Lambdaless and AWS CDK @ AWSKRUG Serverless Group](https://slideshare.net)


### Do and Don'ts

#### Do

- Use lambdaless only if Lambda just do *simple tasks*
  - Lambda just perform simple transformations and call **single** AWS API.

#### Don'ts

- Any other cases except suitable use cases. 
  - Long mapping template will burn your brain


### Contents

#### Services

- [Comment Service](./comment)
- [Email Subscription Service](./email-subscription)
- idea: URL Shortener Service

#### Proxies

- [Proxy](./proxy)

#### Collectors

- [Sendgrid Event Collector](./sendgrid-event-collector)
- idea: [Slack Event](https://api.slack.com/events-api) Collector

## License

[MIT](LICENSE)

See full license on [mooyoul.mit-license.org](http://mooyoul.mit-license.org/)
