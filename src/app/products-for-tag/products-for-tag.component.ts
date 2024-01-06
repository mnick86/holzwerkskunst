import {Component} from '@angular/core';
import {ProductsForTagStore} from './+store/products-for-tag.store';
import {combineLatest} from 'rxjs';
import {Meta} from '@angular/platform-browser';

@Component({
  selector: 'app-products-for-tag',
  templateUrl: './products-for-tag.component.html',
  styleUrl: './products-for-tag.component.scss',
  providers: [ProductsForTagStore],
})
export class ProductsForTagComponent {
  constructor(
    private productsForTagStore: ProductsForTagStore,
    public meta: Meta,
  ) {
    combineLatest([this.tag$, this.products$]).subscribe(([tag, products]) => {
      meta.updateTag({property: 'og:title', content: 'Kategorie ' + tag});
      meta.updateTag({property: 'og:type', content: 'website'});
      meta.updateTag({
        name: 'og:description',
        content: 'Alles zum Thema ' + tag,
      });
      meta.updateTag({property: 'og:site_name', content: 'Holzwerkskunst.de'});
      meta.updateTag({property: 'og:url', content: window.location.href});

      if (products.length > 0) {
        const image = products[0].images[0].small;
        const url = new URL(window.location.href);
        meta.updateTag({
          name: 'og:image',
          content: url.origin + '/' + image,
        });
      }
    });
  }

  tag$ = this.productsForTagStore.selectTag$;
  products$ = this.productsForTagStore.selectProductsForTag$;
}
