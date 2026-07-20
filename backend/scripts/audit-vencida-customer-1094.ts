import { getCustomerById } from '../src/integrations/sgp/customers';
async function main() {
  const c = await getCustomerById('1094');
  console.log(JSON.stringify({ id: c.id, name: c.name, document: c.document, status: c.status }, null, 2));
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
