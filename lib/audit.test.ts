import { describe, expect, it } from "vitest";
import { auditData } from "./audit";

describe("audit foundation", () => {
  it("preserves actor, before/after and reason context", () => {
    expect(auditData({ actorId:"actor",action:"CATEGORY_UPDATED",entityType:"Category",entityId:"category",before:{name:"Beer"},after:{name:"Packaged Beer"},reason:"Approved rename" })).toMatchObject({ actorId:"actor",action:"CATEGORY_UPDATED",before:{name:"Beer"},after:{name:"Packaged Beer"},reason:"Approved rename" });
  });

  it("normalizes optional metadata", () => {
    expect(auditData({ action:"LOCATION_CREATED",entityType:"Location",entityId:"bar" })).toMatchObject({ actorId:null,reason:null,correlationId:null });
  });
});
