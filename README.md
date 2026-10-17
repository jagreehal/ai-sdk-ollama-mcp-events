# MCP events with ai-sdk-ollama

You'll start a [Skybridge](https://docs.skybridge.tech) server and an AI SDK client, then follow a sample comment from an [MCP event](https://ai-sdk.dev/cookbook/node/mcp-events) to a one-sentence summary. You don't need a model API key. The server listens on port 3002 and the client's webhook on 3003, so keep both free.

## Run it

Install Node.js 22.23.1 or newer and pnpm. Start [Ollama](https://ollama.com) on your machine.

Install the dependencies and download the model:

```sh
pnpm install
ollama pull granite4.2:3b
```

Start the MCP server:

```sh
pnpm server
```

In another terminal, run the client:

```sh
pnpm client
```

You should see the sample comment and a summary:

```text
Available events: [ 'comment.created' ]
Subscribed (callback verified): sub_…
Received: cmt_… {
  document_id: 'doc_123',
  text: 'The Q3 numbers in section 2 double-count EMEA refunds; can someone check before Friday?'
}
Summary (granite4.2:3b, 3346ms): The Q3 numbers in section 2 double-count EMEA refunds and require verification before Friday.
```

Your summary wording and timing will vary. After the client exits, stop the server with Ctrl+C.

To try another model, download it and pass its name:

```sh
ollama pull qwen3.5:4b
pnpm client qwen3.5:4b
```

## How it works

1. The client asks the server which events it offers and subscribes to `comment.created` for a document.
2. The server verifies the client's webhook address.
3. The client publishes a sample comment to trigger an event.
4. The server sends the comment to the webhook, where the AI SDK checks its signature.
5. The client ends the subscription and asks Ollama to summarize the comment.

In your own application, call `deliverEvent` wherever you save comments, in place of the `publish_comment` tool.

## Code

- [src/server.ts](src/server.ts) defines the event and publishes comments.
- [src/client.ts](src/client.ts) subscribes, receives the webhook, and generates the summary.
- [vite.config.ts](vite.config.ts) is empty. Skybridge's dev mode needs it to start.

Skybridge's events API is only in its `next` build, so `package.json` pins `skybridge@0.0.0-next.a297d2a`. The stable 2.0.4 release has no `registerEvent`.

Restarting the demo clears its subscriptions and queued comments. Before deploying your own version, add durable storage, subscription renewal, and delivery retries. Follow the [AI SDK cookbook](https://ai-sdk.dev/cookbook/node/mcp-events) for those steps.
