import { describe, it, expect } from "vitest";
import { gitlabCanWrite, gitlabCanRead, parseScopes } from "../scopes";

describe("parseScopes", () => {
  it("returns [] for null/empty", () => {
    expect(parseScopes(null)).toEqual([]);
    expect(parseScopes("")).toEqual([]);
    expect(parseScopes(undefined)).toEqual([]);
  });

  it("trims whitespace and drops empties", () => {
    expect(parseScopes(" read_api , api ,, ")).toEqual(["read_api", "api"]);
  });
});

describe("gitlabCanWrite", () => {
  it("true for api scope", () => {
    expect(gitlabCanWrite("api")).toBe(true);
    expect(gitlabCanWrite("read_api,api")).toBe(true);
  });
  it("true for write_repository", () => {
    expect(gitlabCanWrite("write_repository")).toBe(true);
  });
  it("false for read-only scopes", () => {
    expect(gitlabCanWrite("read_api")).toBe(false);
    expect(gitlabCanWrite("read_api,read_repository")).toBe(false);
  });
  it("false for null/empty", () => {
    expect(gitlabCanWrite(null)).toBe(false);
    expect(gitlabCanWrite("")).toBe(false);
  });
});

describe("gitlabCanRead", () => {
  it("true for read_api", () => {
    expect(gitlabCanRead("read_api")).toBe(true);
  });
  it("true for api (implies read)", () => {
    expect(gitlabCanRead("api")).toBe(true);
  });
  it("true for read_repository", () => {
    expect(gitlabCanRead("read_repository")).toBe(true);
  });
  it("false for empty/null", () => {
    expect(gitlabCanRead(null)).toBe(false);
    expect(gitlabCanRead("")).toBe(false);
  });
});
