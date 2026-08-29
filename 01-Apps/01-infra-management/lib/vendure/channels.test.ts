import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { getVendureChannels } from "./channels";

describe("Vendure channel discovery", () => {
  beforeEach(() => vi.unstubAllGlobals());

  it("authenticates with superadmin credentials and returns safe channel data", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ data: { login: { __typename: "CurrentUser" } } }),
          { headers: { "vendure-auth-token": "session-token" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              channels: {
                items: [{ id: "1", code: "default", token: "channel-token" }],
              },
            },
          }),
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      getVendureChannels({
        adminApiUrl: "https://vendure.example.com/admin-api",
        username: "admin@example.com",
        password: "secret",
      }),
    ).resolves.toEqual([{ id: "1", code: "default", token: "channel-token" }]);
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://vendure.example.com/admin-api",
      expect.objectContaining({
        headers: expect.objectContaining({
          authorization: "Bearer session-token",
        }),
      }),
    );
  });

  it("does not query channels when login fails", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            login: {
              __typename: "InvalidCredentialsError",
              message: "Invalid credentials",
            },
          },
        }),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      getVendureChannels({
        adminApiUrl: "https://vendure.example.com/admin-api",
        username: "admin",
        password: "wrong",
      }),
    ).rejects.toThrow("Invalid credentials");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
