import "server-only";

export type VendureChannel = {
  id: string;
  code: string;
  token: string;
};

type GraphqlResponse<T> = {
  data?: T;
  errors?: Array<{ message?: string }>;
};

async function vendureRequest<T>(
  url: string,
  query: string,
  headers: HeadersInit = {},
) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify({ query }),
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    throw new Error(`Vendure returned HTTP ${response.status}.`);
  }
  const payload = (await response.json()) as GraphqlResponse<T>;
  if (payload.errors?.length || !payload.data) {
    throw new Error(payload.errors?.[0]?.message || "Vendure returned no data.");
  }
  return { data: payload.data, response };
}

export async function getVendureChannels(input: {
  adminApiUrl: string;
  username: string;
  password: string;
}): Promise<VendureChannel[]> {
  const identifier = JSON.stringify(input.username);
  const password = JSON.stringify(input.password);
  const login = await vendureRequest<{
    login: { __typename: string; message?: string };
  }>(
    input.adminApiUrl,
    `mutation { login(username: ${identifier}, password: ${password}, rememberMe: false) { __typename ... on CurrentUser { id } ... on ErrorResult { message } } }`,
  );
  if (login.data.login.__typename !== "CurrentUser") {
    throw new Error(login.data.login.message || "Vendure login failed.");
  }
  const authToken = login.response.headers.get("vendure-auth-token");
  if (!authToken) throw new Error("Vendure did not return an auth token.");

  const channels = await vendureRequest<{
    channels: { items: VendureChannel[] };
  }>(input.adminApiUrl, "query { channels { items { id code token } } }", {
    authorization: `Bearer ${authToken}`,
  });
  return channels.data.channels.items.filter(
    (channel) => channel.id && channel.code && channel.token,
  );
}
