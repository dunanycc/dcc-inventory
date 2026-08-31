"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { hasPermission } from "@/lib/authorization";
import { calculateDeliveryQuantity } from "@/lib/delivery";
import { prisma } from "@/lib/prisma";
import { currentUser } from "@/lib/session";

export async function postDeliveryAction(formData:FormData) {
  let target:string;
  try {
    const actor=await currentUser(); if(!actor||!hasPermission(actor.role,"operations:post")) throw new Error("FORBIDDEN");
    const vendorId=String(formData.get("vendorId")??""); const date=String(formData.get("deliveryDate")??""); const notes=String(formData.get("notes")??"").trim();
    const raw=JSON.parse(String(formData.get("items")??"[]")) as Array<{productId:string;quantity:string}>;
    if(!vendorId||!/^\d{4}-\d{2}-\d{2}$/.test(date)||notes.length>1000||!Array.isArray(raw)||!raw.length) throw new Error("INVALID");
    await prisma.$transaction(async tx=>{
      const fresh=await tx.user.findUnique({where:{id:actor.id},select:{id:true,role:true,status:true}}); if(!fresh||fresh.status!=="ACTIVE"||!hasPermission(fresh.role,"operations:post")) throw new Error("FORBIDDEN");
      const vendor=await tx.vendor.findUnique({where:{id:vendorId},select:{active:true}}); if(!vendor?.active) throw new Error("VENDOR");
      const bar=await tx.location.findUnique({where:{code:"BAR"},select:{id:true,active:true}}); if(!bar?.active) throw new Error("BAR");
      const products=await tx.product.findMany({where:{id:{in:raw.map(i=>i.productId)}},include:{productLocations:{where:{locationId:bar.id},select:{active:true,reviewRequired:true}}}});
      const byId=new Map(products.map(p=>[p.id,p])); const computed=raw.map(item=>{const p=byId.get(item.productId); if(!p?.active||!p.productLocations[0]?.active||p.productLocations[0].reviewRequired) throw new Error("PRODUCT"); return {p,...calculateDeliveryQuantity(item.quantity,p)};});
      const occurredAt=new Date(`${date}T12:00:00.000Z`); const delivery=await tx.delivery.create({data:{vendorId,deliveryDate:occurredAt,notes:notes||null,recordedById:fresh.id}});
      for(const item of computed){const line=await tx.deliveryLine.create({data:{deliveryId:delivery.id,productId:item.p.id,quantity:item.stockQuantity,entryQuantity:item.entryQuantity,purchaseUnit:item.purchaseUnit,unitsPerPurchaseUnit:item.unitsPerPurchaseUnit}}); await tx.inventoryMovement.create({data:{type:"RECEIPT",productId:item.p.id,quantity:item.stockQuantity,sourceLocationId:null,destinationLocationId:bar.id,occurredAt,postedById:fresh.id,deliveryLineId:line.id,notes:`Delivery ${delivery.id.slice(0,8)}`}});}
    },{isolationLevel:"Serializable"});
    revalidatePath("/deliveries"); revalidatePath("/inventory"); revalidatePath("/history"); target="/deliveries?success="+encodeURIComponent("Delivery added to Bar inventory.");
  } catch(error){console.error("Delivery posting failed",error); target="/deliveries?error="+encodeURIComponent("Delivery could not be posted. Review the Vendor, date, products, and quantities.");}
  redirect(target);
}
