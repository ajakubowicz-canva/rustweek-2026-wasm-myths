export interface ObjectWithNumbers {
    a: number,
    b: number,
    c: number,
    d: number,
    e: number,
}

export function sum_fields_mono(obj: ObjectWithNumbers): number {
    return obj.a + obj.b + obj.c + obj.d + obj.e;
}

export function sum_fields_mega(obj: ObjectWithNumbers): number {
    return obj.a + obj.b + obj.c + obj.d + obj.e;
}

