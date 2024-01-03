import {ChangeDetectionStrategy, Component} from '@angular/core';
import {ProductStore} from './+store/product.store';
import {map} from 'rxjs';

@Component({
  selector: 'app-product',
  templateUrl: './product.component.html',
  styleUrl: './product.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [ProductStore],
})
export class ProductComponent {
  constructor(public productStore: ProductStore) {}

  product$ = this.productStore.selectProduct$;
  whatsapp$ = this.product$.pipe(
    map((product) => {
      return `WhatsApp://send?text=Siehe dir das an: ${product?.name}. ${window.location.href}`;
    }),
  );

  displayCustom: boolean = false;

  activeIndex: number = 0;

  imageClick(index: number) {
    this.activeIndex = index;
    this.displayCustom = true;
  }
}
