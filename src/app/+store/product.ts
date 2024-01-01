export interface Product {
    name: string;
    description: string;
    created: string;
    tags: string[]
}

export const mockData: Product[] = [
    {
        name: 'Glubbal',
        description: 'Sehr schöne Glubbal lorem ipsum',
        created: new Date().toISOString(),
        tags: ['Glubbal', 'Holz']
    },
    {
        name: 'Holzsterne',
        description: 'gravierte holzsterne',
        created: new Date().toISOString(),
        tags: ['Holz', 'Weihnachten']
    }
]