import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const prismaClientSingleton = () => {
    const raw = process.env.DATABASE_URL
    if (!raw?.trim()) {
        throw new Error('DATABASE_URL ortam değişkeni tanımlı değil.')
    }
    // Bağlantı zaman aşımı (saniye) — uzun beklemeyi önler
    const separator = raw.includes('?') ? '&' : '?'
    const connectionString = `${raw}${separator}connect_timeout=15`

    // Prisma Postgres için Adapter kullanımı (pool: bağlantı havuzu, connectionTimeoutMillis: havuzdan bağlantı bekleme süresi)
    const adapter = new PrismaPg({
        connectionString,
        connectionTimeoutMillis: 20_000,
    })

    return new PrismaClient({ adapter })
}

declare global {
    var prismaGlobal: undefined | ReturnType<typeof prismaClientSingleton>
}

// Global instance'ı 'db' değişkenine atıyoruz
const db = globalThis.prismaGlobal ?? prismaClientSingleton()

export default db

if (process.env.NODE_ENV !== 'production') globalThis.prismaGlobal = db