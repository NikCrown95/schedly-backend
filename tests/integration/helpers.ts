import type { FastifyInstance } from "fastify";

let counter = 0;

export async function registerBusiness(app: FastifyInstance, overrides: Record<string, unknown> = {}) {
  counter += 1;
  const response = await app.inject({
    method: "POST",
    url: "/auth/register",
    payload: {
      email: `owner${counter}@example.com`,
      password: "password123",
      firstName: "Test",
      lastName: "Owner",
      businessName: `Test Business ${counter}`,
      ...overrides,
    },
  });

  if (response.statusCode !== 201) {
    throw new Error(`Failed to register test business: ${response.body}`);
  }

  const body = response.json();
  return {
    accessToken: body.accessToken as string,
    businessId: body.business.id as string,
    userId: body.user.id as string,
  };
}

export function authHeader(accessToken: string) {
  return { authorization: `Bearer ${accessToken}` };
}
