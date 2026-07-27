export interface Station {
  id: number;
  name: string;
  slug: string;
}

export interface Tax {
  id: number;
  slug: string;
  value: number | string;
}
