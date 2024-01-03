import {ChangeDetectionStrategy, Component, Input} from '@angular/core';
import {Product} from '../+store/product';

@Component({
  selector: 'app-product-list',
  templateUrl: './product-list.component.html',
  styleUrl: './product-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProductListComponent {
  @Input()
  products: Product[] | null = null;
}
