import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const products = [
  {
    id: '00000000-0000-4000-8000-000000000001',
    name: 'Sikat Gigi Ortho Soft',
    description:
      'Sikat gigi khusus pengguna behel dengan bulu sikat lembut berbentuk V.',
    imageUrl: 'https://placehold.co/600x400?text=Sikat+Ortho',
    price: 35000n,
    stock: 100,
    isActive: true,
  },
  {
    id: '00000000-0000-4000-8000-000000000002',
    name: 'Dental Floss Mint 50m',
    description: 'Benang gigi rasa mint untuk membersihkan sela gigi.',
    imageUrl: 'https://placehold.co/600x400?text=Dental+Floss',
    price: 28000n,
    stock: 50,
    isActive: true,
  },
  {
    id: '00000000-0000-4000-8000-000000000003',
    name: 'Mouthwash Antibakteri 250ml',
    description: 'Obat kumur tanpa alkohol untuk menjaga kesehatan gusi.',
    imageUrl: 'https://placehold.co/600x400?text=Mouthwash',
    price: 45000n,
    stock: 30,
    isActive: true,
  },
  {
    id: '00000000-0000-4000-8000-000000000004',
    name: 'Water Flosser Portable',
    description:
      'Pembersih sela gigi dengan semprotan air, bisa dicas lewat USB-C.',
    imageUrl: 'https://placehold.co/600x400?text=Water+Flosser',
    price: 425000n,
    stock: 1, // sengaja 1: buat ngetes rebutan stok terakhir
    isActive: true,
  },
  {
    id: '00000000-0000-4000-8000-000000000005',
    name: 'Pasta Gigi Edisi Lama',
    description: 'Produk yang sudah tidak dijual.',
    imageUrl: 'https://placehold.co/600x400?text=Discontinued',
    price: 20000n,
    stock: 10,
    isActive: false, // sengaja nonaktif: nggak boleh muncul di GET /products
  },
];

async function main() {
  for (const product of products) {
    const { id, ...data } = product;

    await prisma.product.upsert({
      where: { id },
      update: data,
      create: product,
    });
  }

  console.log(`Seeded ${products.length} products`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
