import {NgModule} from '@angular/core';
import {RouterModule, Routes} from '@angular/router';
import {HomeComponent} from './home/home.component';
import {ImpressumComponent} from './impressum/impressum.component';
import {ProductComponent} from './product/product.component';
import {DataProtectionComponent} from './data-protection/data-protection.component';
import {ProductsForTagComponent} from './products-for-tag/products-for-tag.component';

const routes: Routes = [
  {
    path: 'produkte/:tag',
    component: ProductsForTagComponent,
  },
  {
    path: 'produkt/:id',
    component: ProductComponent,
  },
  {
    path: 'Impressum',
    component: ImpressumComponent,
  },
  {
    path: 'Datenschutz',
    component: DataProtectionComponent,
  },
  {
    path: '**',
    component: HomeComponent,
  },
];

@NgModule({
  imports: [RouterModule.forRoot(routes, {scrollPositionRestoration: 'enabled'})],
  exports: [RouterModule],
})
export class AppRoutingModule {}
