export interface ProductImage {
  small: string;
  large: string;
}

export interface Product {
  id: string;
  name: string;
  description: string;
  created: string;
  tags: string[];
  images: ProductImage[];
}
