import {ChangeDetectionStrategy, Component} from '@angular/core';
import {ProductStore} from './+store/product.store';
import {map} from 'rxjs';
import {AppStore} from '../+store/app.store';
import {Meta} from '@angular/platform-browser';

@Component({
  selector: 'app-product',
  templateUrl: './product.component.html',
  styleUrl: './product.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [ProductStore],
})
export class ProductComponent {
  constructor(
    public productStore: ProductStore,
    public store: AppStore,
    public meta: Meta,
  ) {
    this.product$.subscribe((product) => {
      if (!product) {
        return;
      }
      const url = new URL(window.location.href);

      meta.updateTag({property: 'og:title', content: product.name});
      meta.updateTag({property: 'og:type', content: 'website'});
      meta.updateTag({
        name: 'og:description',
        content: product.description,
      });
      meta.updateTag({property: 'og:site_name', content: 'Holzwerkskunst.de'});
      meta.updateTag({property: 'og:url', content: window.location.href});
      meta.updateTag({property: 'og:image', content: url.origin + '/' + product.images[0].small});
    });
  }

  product$ = this.productStore.selectProduct$;

  displayCustom: boolean = false;

  activeIndex: number = 0;

  imageClick(index: number) {
    this.activeIndex = index;
    this.displayCustom = true;
  }

  contact() {
    this.store.setShowContact(true);
  }
}
