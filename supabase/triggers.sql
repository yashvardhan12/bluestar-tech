-- Keeps vehicle_groups.total_vehicles in sync automatically

create or replace function public.sync_vehicle_group_count()
returns trigger language plpgsql as $$
begin
  -- On INSERT: increment the new group
  if TG_OP = 'INSERT' and NEW.vehicle_group_id is not null then
    update public.vehicle_groups
    set total_vehicles = total_vehicles + 1
    where id = NEW.vehicle_group_id;

  -- On DELETE: decrement the old group
  elsif TG_OP = 'DELETE' and OLD.vehicle_group_id is not null then
    update public.vehicle_groups
    set total_vehicles = greatest(total_vehicles - 1, 0)
    where id = OLD.vehicle_group_id;

  -- On UPDATE: handle group change
  elsif TG_OP = 'UPDATE' then
    if OLD.vehicle_group_id is distinct from NEW.vehicle_group_id then
      if OLD.vehicle_group_id is not null then
        update public.vehicle_groups
        set total_vehicles = greatest(total_vehicles - 1, 0)
        where id = OLD.vehicle_group_id;
      end if;
      if NEW.vehicle_group_id is not null then
        update public.vehicle_groups
        set total_vehicles = total_vehicles + 1
        where id = NEW.vehicle_group_id;
      end if;
    end if;
  end if;

  return coalesce(NEW, OLD);
end;
$$;

drop trigger if exists trg_sync_vehicle_group_count on public.vehicles;

create trigger trg_sync_vehicle_group_count
after insert or update or delete on public.vehicles
for each row execute function public.sync_vehicle_group_count();
