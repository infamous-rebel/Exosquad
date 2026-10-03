import { describe, it, expect, vi, beforeEach } from "vitest";
import dns from "node:dns";
import { validateOutboundUrl } from "../../src/types";

// Mock DNS resolution so tests don't depend on real DNS
vi.mock("node:dns", () => ({
  default: {
    promises: {
      lookup: vi.fn(),
    },
  },
}));

const mockLookup = dns.promises.lookup as ReturnType<typeof vi.fn>;

describe("validateOutboundUrl — SSRF protection", () => {
  beforeEach(() => {
    mockLookup.mockReset();
    // Default: resolve to a public IP
    mockLookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
  });

  // ─── Protocol checks (synchronous — no DNS needed) ─────────────────────

  it("allows valid HTTPS URLs", async () => {
    await expect(validateOutboundUrl("https://api.example.com/v1/data")).resolves.toBeUndefined();
    await expect(validateOutboundUrl("https://data.provider.com/items")).resolves.toBeUndefined();
  });

  it("allows valid HTTP URLs", async () => {
    await expect(validateOutboundUrl("http://api.example.com/v1")).resolves.toBeUndefined();
  });

  it("blocks non-HTTP protocols", async () => {
    await expect(validateOutboundUrl("file:///etc/passwd")).rejects.toThrow(/Blocked protocol/);
    await expect(validateOutboundUrl("ftp://files.example.com/data")).rejects.toThrow(/Blocked protocol/);
    await expect(validateOutboundUrl("gopher://evil.com/")).rejects.toThrow(/Blocked protocol/);
    await expect(validateOutboundUrl("data:text/html,<script>alert(1)</script>")).rejects.toThrow(/Blocked protocol/);
  });

  it("throws on invalid URLs", async () => {
    await expect(validateOutboundUrl("not-a-url")).rejects.toThrow(/Invalid URL/);
    await expect(validateOutboundUrl("")).rejects.toThrow(/Invalid URL/);
  });

  // ─── Hostname checks (blocked before DNS) ──────────────────────────────

  it("blocks localhost", async () => {
    await expect(validateOutboundUrl("http://localhost:3000/api")).rejects.toThrow(/Blocked hostname/);
    await expect(validateOutboundUrl("http://127.0.0.1:8080")).rejects.toThrow(/Blocked hostname/);
    await expect(validateOutboundUrl("http://0.0.0.0:9090")).rejects.toThrow(/Blocked hostname/);
    await expect(validateOutboundUrl("http://[::1]/")).rejects.toThrow(/Blocked hostname/);
  });

  it("blocks docker internal hostnames", async () => {
    await expect(validateOutboundUrl("http://host.docker.internal/api")).rejects.toThrow(/Blocked hostname/);
  });

  // ─── Private IP checks (blocked before DNS) ────────────────────────────

  it("blocks private IP ranges", async () => {
    // 10.x.x.x
    await expect(validateOutboundUrl("http://10.0.0.1/api")).rejects.toThrow(/Blocked private IP/);
    await expect(validateOutboundUrl("http://10.255.255.255/")).rejects.toThrow(/Blocked private IP/);

    // 172.16-31.x.x
    await expect(validateOutboundUrl("http://172.16.0.1/")).rejects.toThrow(/Blocked private IP/);
    await expect(validateOutboundUrl("http://172.31.255.255/")).rejects.toThrow(/Blocked private IP/);

    // 192.168.x.x
    await expect(validateOutboundUrl("http://192.168.1.1/")).rejects.toThrow(/Blocked private IP/);
    await expect(validateOutboundUrl("http://192.168.0.100/")).rejects.toThrow(/Blocked private IP/);
  });

  it("blocks link-local and reserved ranges", async () => {
    await expect(validateOutboundUrl("http://169.254.169.254/")).rejects.toThrow(/Blocked link-local/);
    await expect(validateOutboundUrl("http://0.0.0.0/")).rejects.toThrow(/Blocked hostname/);
  });

  it("blocks shared address space (100.64-127)", async () => {
    await expect(validateOutboundUrl("http://100.64.0.1/")).rejects.toThrow(/Blocked shared address/);
    await expect(validateOutboundUrl("http://100.127.255.255/")).rejects.toThrow(/Blocked shared address/);
  });

  // ─── Embedded credentials ──────────────────────────────────────────────

  it("blocks URLs with embedded credentials", async () => {
    await expect(validateOutboundUrl("http://user:pass@api.example.com/")).rejects.toThrow(/embedded credentials/);
    await expect(validateOutboundUrl("http://user@api.example.com/")).rejects.toThrow(/embedded credentials/);
    await expect(validateOutboundUrl("https://token:@secure.example.com/")).rejects.toThrow(/embedded credentials/);
  });

  // ─── DNS resolution checks ─────────────────────────────────────────────

  it("blocks hostnames that resolve to private IPs (DNS-based SSRF)", async () => {
    mockLookup.mockResolvedValue([{ address: "127.0.0.1", family: 4 }]);
    await expect(validateOutboundUrl("http://evil-resolves-to-localhost.com/")).rejects.toThrow(/Blocked loopback/);

    mockLookup.mockResolvedValue([{ address: "10.0.0.1", family: 4 }]);
    await expect(validateOutboundUrl("http://evil-resolves-to-private.com/")).rejects.toThrow(/Blocked private IP/);

    mockLookup.mockResolvedValue([{ address: "169.254.169.254", family: 4 }]);
    await expect(validateOutboundUrl("http://evil-metadata.com/")).rejects.toThrow(/Blocked link-local/);
  });

  it("blocks hostnames that resolve to private IPv6 addresses", async () => {
    mockLookup.mockResolvedValue([{ address: "::1", family: 6 }]);
    await expect(validateOutboundUrl("http://evil-ipv6.com/")).rejects.toThrow(/Blocked private IPv6/);

    mockLookup.mockResolvedValue([{ address: "fd00::1", family: 6 }]);
    await expect(validateOutboundUrl("http://evil-ula.com/")).rejects.toThrow(/Blocked private IPv6/);

    mockLookup.mockResolvedValue([{ address: "fe80::1", family: 6 }]);
    await expect(validateOutboundUrl("http://evil-linklocal.com/")).rejects.toThrow(/Blocked private IPv6/);
  });

  it("fails closed when DNS resolution fails", async () => {
    mockLookup.mockRejectedValue(new Error("ENOTFOUND"));
    await expect(validateOutboundUrl("http://nonexistent-domain-xyz123.com/")).rejects.toThrow(/DNS resolution failed/);
  });

  it("allows hostnames that resolve to public IPs", async () => {
    mockLookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
    await expect(validateOutboundUrl("https://api.example.com/v1")).resolves.toBeUndefined();
  });

  it("allows public IPs directly", async () => {
    // IP literals: DNS lookup of an IP returns the IP itself
    mockLookup.mockResolvedValue([{ address: "8.8.8.8", family: 4 }]);
    await expect(validateOutboundUrl("http://8.8.8.8/")).resolves.toBeUndefined();
  });
});
