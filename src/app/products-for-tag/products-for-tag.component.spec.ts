import {ComponentFixture, TestBed} from '@angular/core/testing';

import {ProductsForTagComponent} from './products-for-tag.component';

describe('ProductsForTagComponent', () => {
  let component: ProductsForTagComponent;
  let fixture: ComponentFixture<ProductsForTagComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ProductsForTagComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(ProductsForTagComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
