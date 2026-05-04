export interface BenchObj {
    id: string;
    a: number;
    b: number;
}

function createObject(): BenchObj {
    return {
        id: Array.from({ length: 1000 }, () =>
            String.fromCharCode(97 + Math.floor(Math.random() * 26))
        ).join(''),
        a: Math.random() * 100,
        b: Math.random() * 100,
    };
}

const CACHED_OBJECTS: BenchObj[] = Array.from({ length: 300 }, createObject);

export function generateObject(): BenchObj {
    return CACHED_OBJECTS[Math.floor(Math.random() * CACHED_OBJECTS.length)];
}
