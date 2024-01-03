import {Component} from '@angular/core';
import {ProductsForTagStore} from './+store/products-for-tag.store';

@Component({
  selector: 'app-products-for-tag',
  templateUrl: './products-for-tag.component.html',
  styleUrl: './products-for-tag.component.scss',
  providers: [ProductsForTagStore],
})
export class ProductsForTagComponent {
  constructor(private productsForTagStore: ProductsForTagStore) {}

  tag$ = this.productsForTagStore.selectTag$;
  products$ = this.productsForTagStore.selectProductsForTag$;
}
