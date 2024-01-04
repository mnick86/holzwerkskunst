import {ChangeDetectionStrategy, Component} from '@angular/core';
import {ProductStore} from './+store/product.store';
import {map} from 'rxjs';
import {AppStore} from '../+store/app.store';

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
  ) {}

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
