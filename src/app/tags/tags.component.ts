import {ChangeDetectionStrategy, Component, Input} from '@angular/core';
import {Product} from '../+store/product';
import {Router} from '@angular/router';

@Component({
  selector: 'app-tags',
  templateUrl: './tags.component.html',
  styleUrl: './tags.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TagsComponent {
  @Input()
  product!: Product;

  constructor(public router: Router) {}

  click(tag: string) {
    this.router.navigate(['/produkte', tag]);
  }
}
