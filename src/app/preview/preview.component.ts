import {ChangeDetectionStrategy, Component, Input} from '@angular/core';
import {Product} from '../+store/product';
import {Router} from '@angular/router';

@Component({
  selector: 'app-preview',
  templateUrl: './preview.component.html',
  styleUrl: './preview.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PreviewComponent {
  @Input()
  product!: Product;

  constructor(public router: Router) {}

  details() {
    this.router.navigate(['/produkt', this.product.id]);
  }
}
