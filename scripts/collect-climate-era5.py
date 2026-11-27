"""Extract globally consistent ERA5 monthly point records through the public Planette mirror."""
import json
import sys
import icechunk as ic
import numpy as np
import xarray as xr
centers=json.load(open(sys.argv[1]))
storage=ic.s3_storage(bucket="planette-era5",prefix="ERA5_ic/month",region="us-east-2",anonymous=True)
repo=ic.Repository.open(storage)
session=repo.readonly_session(snapshot_id=sys.argv[3]) if len(sys.argv) == 4 else repo.readonly_session("main")
ds=xr.open_zarr(session.store,group="single/0p25latx0p25lon",consolidated=False,chunks={})
print(session.snapshot_id, ds.dims,flush=True)
result={"snapshot":session.snapshot_id,"period":[2021,2025],"centers":centers,"monthly":{}}
# Honor the archive's actual longitude convention, including across the date line.
lat_i = xr.DataArray([int(np.argmin(np.abs(ds.lat.values - c["lat"]))) for c in centers], dims="region")
lon_i = xr.DataArray([int(np.argmin(np.abs((ds.lon.values - c["lon"] + 180) % 360 - 180))) for c in centers], dims="region")
for name, unit in [("t2m","K"),("t2m_max","K"),("pr","kg m**-2 s**-1"),("snd","m of water equivalent")]:
 arr=ds[name].sel(time=slice("2021-01-01","2025-12-31"))
 assert arr.attrs["units"]==unit,(name,arr.attrs.get("units"))
 exp=np.arange(np.datetime64("2021-01"),np.datetime64("2026-01"),dtype="datetime64[M]")
 assert np.array_equal(arr.time.values.astype("datetime64[M]"),exp)
 sel=arr.isel(lat=lat_i, lon=lon_i).transpose("time","region").compute()
 vals=sel.values.astype(float)
 if not np.all(np.isfinite(vals)):
  raise ValueError((name,[(centers[i]["id"], int(np.isfinite(vals[:,i]).sum())) for i in np.where(~np.isfinite(vals).all(0))[0]]))
 result["monthly"][name]=vals.tolist();result["grid"]=[[float(a),float(b)] for a,b in zip(sel.lat.values,sel.lon.values)]
 print(name,vals.shape,np.min(vals),np.max(vals),flush=True)
 open(sys.argv[2]+".partial","w").write(json.dumps(result,ensure_ascii=False))
open(sys.argv[2],"w").write(json.dumps(result,ensure_ascii=False))
