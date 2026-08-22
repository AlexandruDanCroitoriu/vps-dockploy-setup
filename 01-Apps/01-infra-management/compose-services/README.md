# Compose service definitions

Store one TypeScript definition per predefined Compose service in this folder,
then import it and add it to `composeServiceDefinitions` in `registry.ts`.

```ts
import type { ComposeServiceDefinition } from "./registry";

export const exampleService = {
  id: "example-service",
  name: "Example service",
  description: "Short description shown in the dashboard.",
  composeFile: `services:
  app:
    image: example/image:latest
`,
  environmentVariables: `EXAMPLE_SETTING=value`,
} satisfies ComposeServiceDefinition;
```

`environmentVariables` may also be a function that receives the services in
the project's default environment. This allows a definition to derive internal
database connection settings without sending credentials to the browser.

Definitions are committed to Git. Never put passwords, API keys, tokens, or
other secrets in them. Configure secrets after creation using the service's
environment-variable editor.
