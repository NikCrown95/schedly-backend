import { describe, it, expect, vi, beforeEach } from "vitest";
import { normalizePhoneToE164 } from "../src/shared/lib/phone.js";

describe("normalizePhoneToE164", () => {
  it("normalizes a local Italian mobile number to E.164", () => {
    expect(normalizePhoneToE164("333 1234567")).toBe("+393331234567");
  });

  it("normalizes a number already containing the country code with spaces", () => {
    expect(normalizePhoneToE164("+39 333 123 4567")).toBe("+393331234567");
  });

  it("returns null for empty or unparseable input instead of throwing", () => {
    expect(normalizePhoneToE164(undefined)).toBeNull();
    expect(normalizePhoneToE164("")).toBeNull();
    expect(normalizePhoneToE164("not a phone number")).toBeNull();
  });
});

vi.mock("@shared/lib/prisma.js", () => ({
  prisma: {},
}));

vi.mock("../src/modules/customers/customers.repository.js", () => ({
  customersRepository: {
    findByNormalizedPhone: vi.fn(),
    findByEmail: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    findById: vi.fn(),
  },
}));

import { customersRepository } from "../src/modules/customers/customers.repository.js";
import { customersService } from "../src/modules/customers/customers.service.js";

const mockedRepo = vi.mocked(customersRepository, true);

describe("customersService.findOrCreateCustomer — reusable across channels", () => {
  beforeEach(() => vi.clearAllMocks());

  it("reuses an existing customer matched by normalized phone, regardless of input format", async () => {
    mockedRepo.findByNormalizedPhone.mockResolvedValue({
      id: "c1",
      businessId: "b1",
      firstName: "Mario",
      normalizedPhone: "+393331234567",
    } as never);

    const { customer, isNew } = await customersService.findOrCreateCustomer("b1", {
      firstName: "Mario",
      phone: "333 1234567", // formato diverso da come è salvato, ma stesso numero
    });

    expect(isNew).toBe(false);
    expect(customer.id).toBe("c1");
    expect(mockedRepo.findByNormalizedPhone).toHaveBeenCalledWith("b1", "+393331234567");
    expect(mockedRepo.create).not.toHaveBeenCalled();
  });

  it("creates a new customer with normalizedPhone populated when no match exists", async () => {
    mockedRepo.findByNormalizedPhone.mockResolvedValue(null);
    mockedRepo.create.mockResolvedValue({
      id: "c2",
      businessId: "b1",
      firstName: "Giulia",
      normalizedPhone: "+393331234567",
    } as never);

    const { isNew } = await customersService.findOrCreateCustomer("b1", {
      firstName: "Giulia",
      phone: "3331234567",
    });

    expect(isNew).toBe(true);
    expect(mockedRepo.create).toHaveBeenCalledWith(
      "b1",
      expect.objectContaining({ normalizedPhone: "+393331234567" })
    );
  });

  it("falls back to email matching when no usable phone is provided", async () => {
    mockedRepo.findByEmail.mockResolvedValue({ id: "c3", businessId: "b1" } as never);

    const { isNew } = await customersService.findOrCreateCustomer("b1", {
      firstName: "Luca",
      email: "luca@example.com",
    });

    expect(isNew).toBe(false);
    expect(mockedRepo.findByNormalizedPhone).not.toHaveBeenCalled();
  });
});
