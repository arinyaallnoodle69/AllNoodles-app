const fs = require('fs');
const path = require('path');

const files = [
  'src/app/settings/order-window/actions.ts',
  'src/app/settings/customers/actions.ts',
  'src/app/order/actions.ts',
  'src/app/orders/delivery-actions.ts',
  'src/app/orders/actions.ts',
  'src/app/dashboard/settings/actions.ts',
  'src/app/delivery/actions.ts'
];

for (const file of files) {
  const fullPath = path.join(process.cwd(), file);
  if (fs.existsSync(fullPath)) {
    let content = fs.readFileSync(fullPath, 'utf8');
    content = content.replace(/revalidateTag\((`[^`]+`|'[^']+'|"[^"]+"),\s*"max"\)/g, 'revalidateTag($1)');
    fs.writeFileSync(fullPath, content);
  }
}
console.log("Done");
