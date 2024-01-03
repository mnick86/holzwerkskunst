export interface Product {
  id: string;
  name: string;
  description: string;
  created: string;
  tags: string[];
  images: {
    small: string;
    large: string;
  }[];
}
